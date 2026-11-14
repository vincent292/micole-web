import { lazy } from "react";

// Declare once: opening a feature downloads its code; re-renders reuse it.
// Keep import paths explicit so Vite can create one chunk per module.
export const SchoolCalendar = lazy(() =>
  import("./SchoolCalendar").then((m) => ({ default: m.SchoolCalendar })),
);
export const BoliviaSchool = lazy(() =>
  import("./BoliviaSchool").then((m) => ({ default: m.BoliviaSchool })),
);
export const Timetables = lazy(() =>
  import("./Timetables").then((m) => ({ default: m.Timetables })),
);
export const NotificationTests = lazy(() =>
  import("./NotificationTests").then((m) => ({ default: m.NotificationTests })),
);
export const StaffWorkspaceScreen = lazy(() =>
  import("./StaffWorkspace").then((m) => ({ default: m.StaffWorkspaceScreen })),
);
export const SchoolMetrics = lazy(() =>
  import("./SchoolMetrics").then((m) => ({ default: m.SchoolMetrics })),
);
export const InstitutionStudio = lazy(() =>
  import("./InstitutionStudio").then((m) => ({ default: m.InstitutionStudio })),
);
export const SchoolCredentials = lazy(() =>
  import("./InstitutionStudio").then((m) => ({ default: m.SchoolCredentials })),
);
export const VirtualEnrollment = lazy(() =>
  import("./VirtualEnrollment").then((m) => ({ default: m.VirtualEnrollment })),
);
export const InstitutionSites = lazy(() =>
  import("./InstitutionSites").then((m) => ({ default: m.InstitutionSites })),
);
export const DocumentImports = lazy(() =>
  import("./DocumentImports").then((m) => ({ default: m.DocumentImports })),
);
export const DemoRequests = lazy(() =>
  import("./DemoRequests").then((m) => ({ default: m.DemoRequests })),
);
export const Reports = lazy(() =>
  import("./Reports").then((m) => ({ default: m.Reports })),
);
export const PlatformOverview = lazy(() =>
  import("./PlatformWorkspace").then((m) => ({ default: m.PlatformOverview })),
);
export const PlatformSupport = lazy(() =>
  import("./PlatformWorkspace").then((m) => ({ default: m.PlatformSupport })),
);
export const PlatformSettings = lazy(() =>
  import("./PlatformWorkspace").then((m) => ({ default: m.PlatformSettings })),
);
