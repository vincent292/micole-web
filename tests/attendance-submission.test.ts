import { afterEach, expect, it } from "vitest";
import {
  attendanceSubmissionId,
  clearAttendanceSubmission,
} from "../src/lib/attendanceSubmission";
import { clearDrafts } from "../src/lib/sessionDraft";
afterEach(clearDrafts);
it("reutiliza solicitud tras fallo de red y la cambia si se edita la lista o cambia la sede", () => {
  let n = 0;
  const uuid = () => String(++n),
    p = { records: [{ studentId: "s1", status: "absent" }], revision: 1 };
  const first = attendanceSubmissionId("u1:sede1:aula1", p, uuid);
  expect(attendanceSubmissionId("u1:sede1:aula1", p, uuid)).toBe(first);
  expect(
    attendanceSubmissionId("u1:sede1:aula1", { ...p, revision: 2 }, uuid),
  ).not.toBe(first);
  expect(attendanceSubmissionId("u1:sede2:aula1", p, uuid)).not.toBe(first);
  clearAttendanceSubmission("u1:sede1:aula1");
  expect(attendanceSubmissionId("u1:sede1:aula1", p, uuid)).not.toBe(first);
});
