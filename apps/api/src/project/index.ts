import { requireEntitlement } from "../billing/require-entitlement-middleware";
import {
  apiRouter,
  type BaseVariables,
  createRoute,
  errorResponse,
  jsonResponse,
  z,
} from "../openapi";
import { getProjectScope } from "../utils/project-access";
import { requireWorkspacePermission } from "../utils/require-workspace-permission";
import { workspaceAccess } from "../utils/workspace-access-middleware";
import archiveProjectCtrl from "./controllers/archive-project";
import createProjectCtrl from "./controllers/create-project";
import deleteProjectCtrl from "./controllers/delete-project";
import getProjectCtrl from "./controllers/get-project";
import getProjectsCtrl from "./controllers/get-projects";
import {
  addProjectMember,
  getProjectMembers,
  removeProjectMember,
} from "./controllers/project-members";
import reorderProjectsCtrl from "./controllers/reorder-projects";
import unarchiveProjectCtrl from "./controllers/unarchive-project";
import updateProjectCtrl from "./controllers/update-project";
import {
  projectListSchema,
  projectMemberListSchema,
  projectSchema,
} from "./response";
import {
  addProjectMemberBody,
  createProjectBody,
  listProjectsQuery,
  projectMemberParam,
  projectParam,
  reorderProjectsBody,
  updateProjectBody,
  workspaceIdQuery,
} from "./schema";

const listProjectsRoute = createRoute({
  method: "get",
  operationId: "listProjects",
  path: "/",
  tags: ["Projects"],
  summary: "List projects",
  description:
    "List a workspace's projects in sidebar order, each with rollup task statistics. Archived projects are excluded unless includeArchived is set.",
  middleware: [workspaceAccess.fromQuery()] as const,
  request: { query: listProjectsQuery },
  responses: {
    200: jsonResponse("List of projects", projectListSchema),
    400: errorResponse("Workspace ID could not be determined"),
    403: errorResponse("No access to the workspace"),
  },
});

const createProjectRoute = createRoute({
  method: "post",
  operationId: "createProject",
  path: "/",
  tags: ["Projects"],
  summary: "Create project",
  description:
    "Create a project in a workspace. The slug becomes the prefix of its task identifiers.",
  middleware: [
    workspaceAccess.fromBody(),
    requireWorkspacePermission({ project: ["create"] }),
    requireEntitlement,
  ] as const,
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: createProjectBody } },
    },
  },
  responses: {
    200: jsonResponse("The created project", projectSchema),
    400: errorResponse("Invalid body, or workspace ID could not be determined"),
    403: errorResponse(
      "No workspace access, or missing project:create permission",
    ),
  },
});

const getProjectRoute = createRoute({
  method: "get",
  operationId: "getProject",
  path: "/{id}",
  tags: ["Projects"],
  summary: "Get project",
  description: "Get a single project by ID.",
  middleware: [workspaceAccess.fromProject()] as const,
  request: { params: projectParam },
  responses: {
    200: jsonResponse("Project details", projectSchema),
    403: errorResponse("No access to the project's workspace"),
    404: errorResponse(
      "The project does not exist or the caller cannot access it",
    ),
  },
});

const reorderProjectsRoute = createRoute({
  method: "put",
  operationId: "reorderProjects",
  path: "/reorder",
  tags: ["Projects"],
  summary: "Reorder projects",
  description:
    "Set the sidebar order of a workspace's projects. The given positions express relative order only -- the workspace is renumbered to 0..n-1.",
  middleware: [
    workspaceAccess.fromQuery(),
    requireWorkspacePermission({ project: ["update"] }),
  ] as const,
  request: {
    query: workspaceIdQuery,
    body: {
      required: true,
      content: { "application/json": { schema: reorderProjectsBody } },
    },
  },
  responses: {
    // Reorder returns the plain project rows, without the list route's
    // rollup statistics.
    200: jsonResponse("The reordered projects", z.array(projectSchema)),
    400: errorResponse(
      "Invalid body, workspace ID could not be determined, or a project in the payload is not one the caller can reach in this workspace",
    ),
    403: errorResponse(
      "No workspace access, or missing project:update permission",
    ),
  },
});

const updateProjectRoute = createRoute({
  method: "put",
  operationId: "updateProject",
  path: "/{id}",
  tags: ["Projects"],
  summary: "Update project",
  description:
    "Replace a project's name, icon, slug, description, and visibility.",
  middleware: [
    workspaceAccess.fromProject(),
    requireWorkspacePermission({ project: ["update"] }),
  ] as const,
  request: {
    params: projectParam,
    body: {
      required: true,
      content: { "application/json": { schema: updateProjectBody } },
    },
  },
  responses: {
    200: jsonResponse("The updated project", projectSchema),
    400: errorResponse("Invalid body"),
    403: errorResponse(
      "No workspace access, or missing project:update permission",
    ),
    404: errorResponse(
      "The project does not exist or the caller cannot access it",
    ),
  },
});

const deleteProjectRoute = createRoute({
  method: "delete",
  operationId: "deleteProject",
  path: "/{id}",
  tags: ["Projects"],
  summary: "Delete project",
  description:
    "Permanently delete a project and everything in it. Archive it instead to keep the data.",
  middleware: [
    workspaceAccess.fromProject(),
    requireWorkspacePermission({ project: ["delete"] }),
  ] as const,
  request: { params: projectParam },
  responses: {
    200: jsonResponse("The deleted project", projectSchema),
    403: errorResponse(
      "No workspace access, or missing project:delete permission",
    ),
    404: errorResponse(
      "The project does not exist or the caller cannot access it",
    ),
  },
});

const archiveProjectRoute = createRoute({
  method: "put",
  operationId: "archiveProject",
  path: "/{id}/archive",
  tags: ["Projects"],
  summary: "Archive project",
  description:
    "Hide a project from the default list without deleting it. Reversible with unarchive.",
  middleware: [
    workspaceAccess.fromProject(),
    requireWorkspacePermission({ project: ["update"] }),
  ] as const,
  request: { params: projectParam },
  responses: {
    200: jsonResponse("The archived project", projectSchema),
    403: errorResponse(
      "No workspace access, or missing project:update permission",
    ),
    404: errorResponse(
      "The project does not exist or the caller cannot access it",
    ),
  },
});

const unarchiveProjectRoute = createRoute({
  method: "put",
  operationId: "unarchiveProject",
  path: "/{id}/unarchive",
  tags: ["Projects"],
  summary: "Unarchive project",
  description: "Return an archived project to the default list.",
  middleware: [
    workspaceAccess.fromProject(),
    requireWorkspacePermission({ project: ["update"] }),
  ] as const,
  request: { params: projectParam },
  responses: {
    200: jsonResponse("The restored project", projectSchema),
    403: errorResponse(
      "No workspace access, or missing project:update permission",
    ),
    404: errorResponse(
      "The project does not exist or the caller cannot access it",
    ),
  },
});

const listProjectMembersRoute = createRoute({
  method: "get",
  operationId: "listProjectMembers",
  path: "/{id}/members",
  tags: ["Projects"],
  summary: "List project members",
  description:
    "List everyone who can reach the project: the people added to it, and those whose role reaches every project in the workspace. These are also the people a task in the project can be assigned to.",
  middleware: [workspaceAccess.fromProject()] as const,
  request: { params: projectParam },
  responses: {
    200: jsonResponse("The project's members", projectMemberListSchema),
    403: errorResponse("No access to the project's workspace"),
    404: errorResponse(
      "The project does not exist or the caller cannot access it",
    ),
  },
});

const addProjectMemberRoute = createRoute({
  method: "post",
  operationId: "addProjectMember",
  path: "/{id}/members",
  tags: ["Projects"],
  summary: "Add project member",
  description:
    "Give a workspace member access to the project. Adding someone who is already a member changes nothing.",
  middleware: [
    workspaceAccess.fromProject(),
    requireWorkspacePermission({ project: ["update"] }),
  ] as const,
  request: {
    params: projectParam,
    body: {
      required: true,
      content: { "application/json": { schema: addProjectMemberBody } },
    },
  },
  responses: {
    200: jsonResponse("The project's members", projectMemberListSchema),
    403: errorResponse(
      "No workspace access, or missing project:update permission",
    ),
    404: errorResponse(
      "The project, or the user in its workspace, was not found",
    ),
  },
});

const removeProjectMemberRoute = createRoute({
  method: "delete",
  operationId: "removeProjectMember",
  path: "/{id}/members/{userId}",
  tags: ["Projects"],
  summary: "Remove project member",
  description:
    "Take away a member's access to the project. Their tasks stay assigned to them. People whose role reaches every project keep access and cannot be removed here.",
  middleware: [
    workspaceAccess.fromProject(),
    requireWorkspacePermission({ project: ["update"] }),
  ] as const,
  request: { params: projectMemberParam },
  responses: {
    200: jsonResponse("The project's members", projectMemberListSchema),
    403: errorResponse(
      "No workspace access, or missing project:update permission",
    ),
    404: errorResponse("The project or the membership was not found"),
  },
});

const project = apiRouter<BaseVariables & { workspaceId: string }>()
  .openapi(listProjectsRoute, async (c) => {
    const workspaceId = c.get("workspaceId");
    const { includeArchived } = c.req.valid("query");
    const projects = await getProjectsCtrl(
      workspaceId,
      includeArchived === "true",
      await getProjectScope(c),
    );
    return c.json(projects, 200);
  })
  .openapi(listProjectMembersRoute, async (c) =>
    c.json(
      await getProjectMembers(c.get("workspaceId"), c.req.valid("param").id),
      200,
    ),
  )
  .openapi(addProjectMemberRoute, async (c) =>
    c.json(
      await addProjectMember(
        c.get("workspaceId"),
        c.req.valid("param").id,
        c.req.valid("json").userId,
      ),
      200,
    ),
  )
  .openapi(removeProjectMemberRoute, async (c) => {
    const { id, userId } = c.req.valid("param");
    return c.json(
      await removeProjectMember(c.get("workspaceId"), id, userId),
      200,
    );
  })
  .openapi(createProjectRoute, async (c) => {
    const { name, icon, slug } = c.req.valid("json");
    const workspaceId = c.get("workspaceId");
    const newProject = await createProjectCtrl(
      workspaceId,
      name,
      icon,
      slug,
      c.get("userId"),
    );
    return c.json(newProject, 200);
  })
  .openapi(getProjectRoute, async (c) => {
    const { id } = c.req.valid("param");
    const workspaceId = c.get("workspaceId");
    const projectData = await getProjectCtrl(id, workspaceId);
    return c.json(projectData, 200);
  })
  .openapi(reorderProjectsRoute, async (c) => {
    const workspaceId = c.get("workspaceId");
    const { projects } = c.req.valid("json");
    const reordered = await reorderProjectsCtrl(
      workspaceId,
      projects,
      await getProjectScope(c),
    );
    return c.json(reordered, 200);
  })
  .openapi(updateProjectRoute, async (c) => {
    const { id } = c.req.valid("param");
    const { name, icon, slug, description, isPublic } = c.req.valid("json");
    const workspaceId = c.get("workspaceId");
    const updatedProject = await updateProjectCtrl(
      id,
      name,
      icon,
      slug,
      description,
      isPublic,
      workspaceId,
    );
    return c.json(updatedProject, 200);
  })
  .openapi(deleteProjectRoute, async (c) => {
    const { id } = c.req.valid("param");
    const workspaceId = c.get("workspaceId");
    const deletedProject = await deleteProjectCtrl(id, workspaceId);
    return c.json(deletedProject, 200);
  })
  .openapi(archiveProjectRoute, async (c) => {
    const { id } = c.req.valid("param");
    const workspaceId = c.get("workspaceId");
    const archivedProject = await archiveProjectCtrl(id, workspaceId);
    return c.json(archivedProject, 200);
  })
  .openapi(unarchiveProjectRoute, async (c) => {
    const { id } = c.req.valid("param");
    const workspaceId = c.get("workspaceId");
    const unarchivedProject = await unarchiveProjectCtrl(id, workspaceId);
    return c.json(unarchivedProject, 200);
  });

export default project;
