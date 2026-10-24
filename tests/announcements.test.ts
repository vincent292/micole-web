import { describe, it, expect } from "vitest";
import { firebaseMessage } from "../supabase/functions/push-dispatch/core";
import {
  isAnnouncementNotice,
  pendingConfirmation,
  normalizePending,
} from "../src/lib/announcements";
import {
  openAnnouncement,
  subscribeAnnouncements,
  consumeAnnouncement,
} from "../src/lib/announcementEvents";
describe("Avisos y presentación privada", () => {
  it("mantiene pendiente un aviso leído hasta la confirmación de lectura personal", () => {
    expect(
      pendingConfirmation({
        requiresAcknowledgment: true,
        canAcknowledge: true,
        readAt: "2026-10-20",
      }),
    ).toBe(true);
    expect(
      pendingConfirmation({
        requiresAcknowledgment: true,
        canAcknowledge: false,
      }),
    ).toBe(false);
    expect(
      pendingConfirmation({
        requiresAcknowledgment: true,
        canAcknowledge: true,
        acknowledgedAt: "2026-10-20",
      }),
    ).toBe(false);
    expect(isAnnouncementNotice("announcement_reminder_2026102012")).toBe(true);
    expect(normalizePending(null)).toEqual([]);
  });
  it("distingue salud, recojo y comunicados sin enviar nombres, contenidos ni notas", () => {
    const base = {
      token: "device",
      recipientId: "parent",
      notificationId: "notification",
      category: "alerts",
      kind: "announcement",
      collapseId: "notice",
    };
    for (const [type, icon, sound] of [
      ["health", "ic_micole_health", "micole_health"],
      ["pickup", "ic_micole_pickup", "micole_pickup"],
      ["announcement", "ic_micole_announcement", "default"],
    ]) {
      const message = firebaseMessage({ ...base, alertType: type }).message;
      expect(message.android.notification).toMatchObject({
        channel_id: `micole-${type}`,
        icon,
        sound,
        visibility: "PRIVATE",
        tag: "notice",
      });
      expect(message.data).toEqual({
        notificationId: "notification",
        recipientId: "parent",
      });
      expect(message.notification.body).not.toMatch(
        /alumno|Lucía|alergia|calificación/,
      );
    }
  });
  it("abre una sola vez un aviso recibido antes de montar su lector", async () => {
    consumeAnnouncement();
    openAnnouncement("pending");
    const values: string[] = [];
    const off = subscribeAnnouncements((id) => values.push(id));
    await Promise.resolve();
    openAnnouncement("second");
    expect(values).toEqual(["pending", "second"]);
    off();
    const off2 = subscribeAnnouncements((id) => values.push(id));
    await Promise.resolve();
    expect(values).toHaveLength(2);
    off2();
  });
});
