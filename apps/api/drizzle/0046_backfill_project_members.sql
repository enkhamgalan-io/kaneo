-- Project access starts from task assignments: everyone assigned a task in a project (any status, archived projects included) becomes its member, provided they still belong to the project's workspace. Viewers and Members with no assigned tasks start with no projects; an admin adds them in Project settings > Members. Idempotent, so it is safe to re-run.
INSERT INTO "project_member" ("id", "workspace_id", "project_id", "user_id", "created_at")
SELECT gen_random_uuid()::text, a."workspace_id", a."project_id", a."user_id", now()
FROM (
	SELECT DISTINCT p."workspace_id", t."project_id", t."assignee_id" AS "user_id"
	FROM "task" t
	JOIN "project" p ON p."id" = t."project_id"
	WHERE t."assignee_id" IS NOT NULL
		AND EXISTS (
			SELECT 1 FROM "workspace_member" m
			WHERE m."workspace_id" = p."workspace_id" AND m."user_id" = t."assignee_id"
		)
) a
ON CONFLICT ("project_id", "user_id") DO NOTHING;
--> statement-breakpoint
-- Admins could reach every project before this release, so every stored admin role gains project:access_all, including admin roles edited to drop project actions. The workspace_role row takes precedence over the built-in role, which is why the code change alone is not enough. Rows that are not a JSON object are skipped: they already fall back to the built-in admin, which includes access_all.
DO $$
DECLARE
	r record;
	p jsonb;
BEGIN
	FOR r IN SELECT "id", "permission" FROM "workspace_role" WHERE "role" = 'admin' LOOP
		BEGIN
			p := r."permission"::jsonb;
		EXCEPTION WHEN others THEN
			CONTINUE;
		END;
		IF jsonb_typeof(p) = 'object'
			AND COALESCE(jsonb_typeof(p -> 'project'), 'array') = 'array'
			AND NOT (COALESCE(p -> 'project', '[]'::jsonb) @> '["access_all"]'::jsonb) THEN
			UPDATE "workspace_role"
			SET "permission" = jsonb_set(p, '{project}', COALESCE(p -> 'project', '[]'::jsonb) || '["access_all"]'::jsonb, true)::text,
				"updated_at" = now()
			WHERE "id" = r."id";
		END IF;
	END LOOP;
END $$;
