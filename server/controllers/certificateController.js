import { asyncHandler } from "../utils/asyncHandler.js";
import {
  exportUserCertificates,
  listUserCertificates,
  verifyCertificateByCode
} from "../services/certificateService.js";

export const listMyCertificatesController = asyncHandler(async (req, res) => {
  const result = await listUserCertificates(req.companyId, req.user.id);
  res.json(result);
});

export const exportMyCertificatesController = asyncHandler(async (req, res) => {
  const result = await exportUserCertificates(
    req.companyId,
    req.user.id,
    req.body.certificateIds,
    req.user.id
  );
  res.json(result);
});

export const verifyCertificateController = asyncHandler(async (req, res) => {
  const result = await verifyCertificateByCode(req.params.code);
  res.json(result);
});
