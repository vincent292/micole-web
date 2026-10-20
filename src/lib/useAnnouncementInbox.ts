import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { subscribeAnnouncements } from "./announcementEvents";
import {
  normalizePending,
  pendingConfirmation,
  type AnnouncementView,
  type AnnouncementReceipt,
} from "./announcements";
export interface NoticeApi {
  pending: () => Promise<AnnouncementView[]>;
  view: (id: string) => Promise<AnnouncementView>;
  read: (id: string, agree: boolean) => Promise<AnnouncementView>;
  report: (id: string) => Promise<AnnouncementReceipt[]>;
  withdraw: (id: string) => Promise<void>;
}
export function useAnnouncementInbox({
  scope,
  enabled,
  api,
  canOpen,
  onChanged,
  revision,
}: {
  scope: string;
  enabled: boolean;
  revision?: string;
  api: NoticeApi;
  canOpen: () => boolean;
  onChanged: () => void;
}) {
  const [notice, setNotice] = useState<AnnouncementView | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [agree, setAgree] = useState(false),
    [report, setReport] = useState<AnnouncementReceipt[] | null>(null);
  const current = useRef({ api, canOpen, onChanged });
  useLayoutEffect(() => {
    current.current = { api, canOpen, onChanged };
  }, [api, canOpen, onChanged]);
  const active = useRef<AnnouncementView | null>(null),
    working = useRef(false),
    generation = useRef(0),
    queued = useRef<string | undefined>(undefined);
  const retry = useRef<() => void>(() => {});
  useEffect(() => {
    const version = ++generation.current;
    let alive = true;
    active.current = null;
    working.current = false;
    async function show(id: string) {
      if (working.current || !current.current.canOpen()) {
        queued.current = id;
        return;
      }
      if (
        pendingConfirmation(active.current || {}) &&
        active.current?.id !== id
      ) {
        queued.current = id;
        return;
      }
      working.current = true;
      setBusy(true);
      setError("");
      try {
        let value = await current.current.api.view(id);
        if (!alive || generation.current !== version) return;
        if (value.canAcknowledge)
          value = await current.current.api.read(id, false);
        if (!alive || generation.current !== version) return;
        active.current = value;
        setNotice(value);
        setAgree(false);
        setReport(null);
      } catch (e) {
        if (alive && generation.current === version)
          setError(
            e instanceof Error ? e.message : "No pudimos abrir el aviso.",
          );
      } finally {
        if (alive && generation.current === version) {
          working.current = false;
          setBusy(false);
        }
      }
    }
    async function check() {
      if (
        !enabled ||
        !alive ||
        working.current ||
        active.current ||
        !current.current.canOpen()
      )
        return;
      if (queued.current) {
        const id = queued.current;
        queued.current = undefined;
        await show(id);
        return;
      }
      working.current = true;
      try {
        const list = normalizePending(await current.current.api.pending());
        if (alive && generation.current === version && list[0]) {
          working.current = false;
          await show(list[0].id);
        }
      } catch (e) {
        if (alive)
          setError(
            e instanceof Error ? e.message : "No pudimos consultar los avisos.",
          );
      } finally {
        if (alive && generation.current === version) working.current = false;
      }
    }
    retry.current = () => {
      setError("");
      void check();
    };
    const off = subscribeAnnouncements((id) => {
      if (enabled) void show(id);
    });
    void check();
    const timer = setInterval(() => void check(), 60000);
    return () => {
      alive = false;
      generation.current = version + 1;
      off();
      clearInterval(timer);
    };
  }, [scope, enabled]);
  useEffect(() => {
    retry.current();
  }, [revision]);
  async function action(kind: "accept" | "report" | "withdraw") {
    const value = active.current;
    if (!value || working.current) return;
    const version = generation.current;
    working.current = true;
    setBusy(true);
    setError("");
    try {
      if (kind === "accept") {
        if (pendingConfirmation(value) && !agree) return;
        await current.current.api.read(value.id, true);
      }
      if (kind === "report") {
        const rows = await current.current.api.report(value.id);
        if (generation.current === version) setReport(rows);
        return;
      }
      if (kind === "withdraw") await current.current.api.withdraw(value.id);
      if (generation.current !== version) return;
      active.current = null;
      setNotice(null);
      setReport(null);
      setAgree(false);
      current.current.onChanged();
      setTimeout(() => { if(generation.current===version)retry.current(); }, 0);
    } catch (e) {
      if (generation.current === version)
        setError(
          e instanceof Error
            ? e.message
            : "No pudimos guardar la confirmación.",
        );
    } finally {
      if (generation.current === version) {
        working.current = false;
        setBusy(false);
      }
    }
  }
  function close() {
    if (working.current || pendingConfirmation(active.current || {})) return;
    active.current = null;
    setNotice(null);
    setReport(null);
    current.current.onChanged();
    const version=generation.current;
    setTimeout(() => { if(generation.current===version)retry.current(); }, 0);
  }
  return {
    notice,
    error,
    busy,
    agree,
    setAgree,
    report,
    action,
    close,
    retry: () => retry.current(),
    required: pendingConfirmation(notice || {}),
  };
}
