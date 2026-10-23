import { onWorkspaceChange } from "./workspaceEvents";
import {clearDrafts} from "./sessionDraft";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { liveMode, supabase, setSupportSession, authReturnIssue } from "./supabase";
import { claimInvitation, getIdentity } from "./repository";
import type { Identity } from "./types";
export function useIdentity() {
  const navigate = useNavigate();
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [loading, setLoading] = useState(liveMode);
  const [error, setError] = useState(authReturnIssue);
  const [signedIn, setSignedIn] = useState(false);
  const sequenceRef = useRef(0);
  const refresh = useCallback(async () => {
    if (!supabase || !liveMode) {
      setLoading(false);
      return;
    }
    const sequence = ++sequenceRef.current;
    try {
      const { data, error: authError } = await supabase.auth.getUser();
      if (authError && authError.name !== "AuthSessionMissingError")
        throw authError;
      if (sequence !== sequenceRef.current) return;
      setSignedIn(!!data.user);
      if (!data.user) {
        if (authReturnIssue && (location.search.includes("error") || location.hash.includes("error")))
          history.replaceState(null, "", location.pathname);
        setSupportSession(null);
        setIdentity(null);
        return;
      }
      let invitationClaimed = false;
      const token = location.pathname.startsWith("/invite/")
        ? location.pathname.split("/")[2]
        : sessionStorage.getItem("micole_invite") ||
          sessionStorage.getItem("aulanexo_invite");
      if (token) {
        await claimInvitation(token);
        if (sequence !== sequenceRef.current) return;
        sessionStorage.removeItem("aulanexo_invite");
        sessionStorage.removeItem("micole_invite");
        invitationClaimed = true;
      }
      let next: Identity;
      try {
        next = await getIdentity();
      } catch (e) {
        if (!(e instanceof Error) || !e.message.includes("support_expired"))
          throw e;
        setSupportSession(null);
        next = await getIdentity();
        navigate("/app/support", { replace: true });
      }
      if (sequence !== sequenceRef.current) return;
      setIdentity(next);
      if (next.roles.length) sessionStorage.removeItem("micole_school_intent");
      setError("");
      if (invitationClaimed)
        navigate(
          next.roles.includes("guardian") ? "/app/family" : "/app/overview",
          { replace: true },
        );
    } catch (e) {
      if (sequence !== sequenceRef.current) return;
      setIdentity(null);
      setError(
        e instanceof Error ? e.message : "No pudimos verificar tu acceso.",
      );
    } finally {
      if (sequence === sequenceRef.current) setLoading(false);
    }
  }, [navigate]);
  useEffect(() => {
    void refresh();
    if (!supabase || !liveMode) return;
    let pendingFocus = false;
    const focus = () => {
      if (document.querySelector('[aria-modal="true"]')) { pendingFocus = true; return; }
      pendingFocus = false;
      void refresh();
    };
    const offChanges = onWorkspaceChange(change => { if (["timetable_delegates", "school_memberships", "student_guardians", "student_logins", "teachers", "teacher_classrooms"].includes(change.table)) focus(); });
    const modalClosed = () => { if (pendingFocus) window.setTimeout(focus, 0); };
    window.addEventListener("micole:modal-closed", modalClosed);
    window.addEventListener("focus", focus);
    const expired = () => {
      navigate("/app/support", { replace: true });
      void refresh();
    };
    window.addEventListener("micole:support-expired", expired);
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        clearDrafts();
        setSupportSession(null);
        sequenceRef.current++;
        setLoading(false);
        setError("");
        setIdentity(null);
        setSignedIn(false);
      }
      if (
        event === "SIGNED_IN" ||
        event === "TOKEN_REFRESHED" ||
        event === "USER_UPDATED"
      )
        window.setTimeout(() => {
          void refresh();
        }, 0);
    });
    return () => {
      offChanges();
      sequenceRef.current++;
      subscription.unsubscribe();
      window.removeEventListener("focus", focus);
      window.removeEventListener("micole:modal-closed", modalClosed);
      window.removeEventListener("micole:support-expired", expired);
    };
  }, [refresh]);
  useEffect(() => {
    if (!identity?.support) return;
    const timer = window.setTimeout(
      () => {
        setSupportSession(null);
        void refresh();
      },
      Math.max(0, new Date(identity.support.expiresAt).getTime() - Date.now()),
    );
    return () => window.clearTimeout(timer);
  }, [identity?.support?.id, identity?.support?.expiresAt, refresh]);
  // Las otras pestañas conservan su propio contexto; una sesión revocada se comprueba al volver.
  return { identity, loading, error, signedIn, refresh };
}
