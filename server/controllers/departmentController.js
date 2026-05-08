import { asyncHandler } from "../utils/asyncHandler.js";
import { parseId } from "../utils/ids.js";
import {
  createDepartment,
  deleteDepartment,
  listDepartments,
  updateDepartment
} from "../services/departmentService.js";

export const listDepartmentsController = asyncHandler(async (req, res) => {
  const departments = await listDepartments(req.companyId);
  res.json(departments);
});

export const createDepartmentController = asyncHandler(async (req, res) => {
  const department = await createDepartment(req.companyId, req.body);
  res.status(201).json(department);
});

export const updateDepartmentController = asyncHandler(async (req, res) => {
  const departmentId = parseId(req.params.id, "ID отдела");
  const department = await updateDepartment(req.companyId, departmentId, req.body);
  res.json(department);
});

export const deleteDepartmentController = asyncHandler(async (req, res) => {
  const departmentId = parseId(req.params.id, "ID отдела");
  const result = await deleteDepartment(req.companyId, departmentId);
  res.json(result);
});
