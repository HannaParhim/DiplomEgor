import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./layouts/AppShell.jsx";
import {
  PermissionRoute,
  ProtectedRoute,
  PublicRoute
} from "./components/ProtectedRoute.jsx";
import { LoginPage } from "./pages/auth/LoginPage.jsx";
import { RegisterCompanyPage } from "./pages/auth/RegisterCompanyPage.jsx";
import { DashboardPage } from "./pages/dashboard/DashboardPage.jsx";
import { ChatPage } from "./pages/chat/ChatPage.jsx";
import { MyCertificatesPage } from "./pages/certificates/MyCertificatesPage.jsx";
import { MyCoursesPage } from "./pages/courses/MyCoursesPage.jsx";
import { CourseViewerPage } from "./pages/courses/CourseViewerPage.jsx";
import { CourseEditorPage } from "./pages/courses/CourseEditorPage.jsx";
import { UsersPage } from "./pages/admin/UsersPage.jsx";
import { DepartmentsPage } from "./pages/admin/DepartmentsPage.jsx";
import { RolesPage } from "./pages/admin/RolesPage.jsx";
import { ReportsPage } from "./pages/admin/ReportsPage.jsx";
import { SettingsPage } from "./pages/admin/SettingsPage.jsx";
import { CertificateVerifyPage } from "./pages/public/CertificateVerifyPage.jsx";

export default function App() {
  return (
    <Routes>
      <Route
        path="/login"
        element={
          <PublicRoute>
            <LoginPage />
          </PublicRoute>
        }
      />
      <Route
        path="/register-company"
        element={
          <PublicRoute>
            <RegisterCompanyPage />
          </PublicRoute>
        }
      />
      <Route path="/verify-certificate/:code" element={<CertificateVerifyPage />} />

      <Route
        element={
          <ProtectedRoute>
            <AppShell />
          </ProtectedRoute>
        }
      >
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/chat" element={<ChatPage />} />
        <Route path="/courses" element={<MyCoursesPage />} />
        <Route path="/certificates" element={<MyCertificatesPage />} />
        <Route path="/courses/:id" element={<CourseViewerPage />} />
        <Route
          path="/courses/:id/editor"
          element={
            <PermissionRoute anyPermissions={["edit_courses"]}>
              <CourseEditorPage />
            </PermissionRoute>
          }
        />
        <Route
          path="/users"
          element={
            <PermissionRoute anyPermissions={["manage_users"]}>
              <UsersPage />
            </PermissionRoute>
          }
        />
        <Route
          path="/departments"
          element={
            <PermissionRoute anyPermissions={["manage_departments"]}>
              <DepartmentsPage />
            </PermissionRoute>
          }
        />
        <Route
          path="/roles"
          element={
            <PermissionRoute anyPermissions={["manage_roles"]}>
              <RolesPage />
            </PermissionRoute>
          }
        />
        <Route
          path="/reports"
          element={
            <PermissionRoute anyPermissions={["view_reports"]}>
              <ReportsPage />
            </PermissionRoute>
          }
        />
        <Route
          path="/settings"
          element={
            <PermissionRoute anyPermissions={["manage_users", "manage_roles", "manage_company_focus"]}>
              <SettingsPage />
            </PermissionRoute>
          }
        />
      </Route>

      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
