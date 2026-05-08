import { asyncHandler } from "../utils/asyncHandler.js";
import { parseId } from "../utils/ids.js";
import {
  createRole,
  deleteRole,
  listRoles,
  updateRole
} from "../services/roleService.js";

export const listRolesController = asyncHandler(async (req, res) => {
  const roles = await listRoles(req.companyId);
  res.json(roles);
});

export const createRoleController = asyncHandler(async (req, res) => {
  const role = await createRole(req.companyId, req.body);
  res.status(201).json(role);
});

export const updateRoleController = asyncHandler(async (req, res) => {
  const roleId = parseId(req.params.id, "ID роли");
  const role = await updateRole(req.companyId, roleId, req.body);
  res.json(role);
});

export const deleteRoleController = asyncHandler(async (req, res) => {
  const roleId = parseId(req.params.id, "ID роли");
  const result = await deleteRole(req.companyId, roleId);
  res.json(result);
});
