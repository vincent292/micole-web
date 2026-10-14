import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { liveMode, supabase, setSupportSession } from "./supabase";
import { claimInvitation, getIdentity } from "./repository";
import type { Identity } from "./types";
export function useIdentity() {
  const navigate = useNavigate();
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [loading, setLoading] = useState(liveMode);
  const [error, setError] = useState("");
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
    const focus = () => {
      void refresh();
    };
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
      sequenceRef.current++;
      subscription.unsubscribe();
      window.removeEventListener("focus", focus);
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
