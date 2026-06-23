"use client";

import { ReactNode, useEffect } from "react";
import { useAtom } from "jotai";
import { useRuntimeConfig } from "@/services/state/runtime-config-context";

import { authenticationAtom } from ".";

type AuthenticationProviderProps = {
  children: ReactNode;
};

export const AuthenticationProvider = ({
  children,
}: AuthenticationProviderProps) => {
  const [authentication, setAuthentication] = useAtom(authenticationAtom);
  const runtimeConfig = useRuntimeConfig();
  
  // Check if auth is enabled via runtime config
  const isCognitoEnabled = runtimeConfig.NEXT_PUBLIC_USE_COGNITO === 'true';
  const isGoogleAuthEnabled = process.env.NEXT_PUBLIC_USE_GOOGLE_AUTH === 'true';

  const startSession = async (): Promise<void> => {
    try {
      setAuthentication({ state: "Authenticating" });


      const response = await fetch(`/api/auth/check-session`, {
        method: 'POST', 
        credentials: 'include',
      });

      
      if (!response.ok) {
        throw new Error(`Session check failed with status ${response.status}`);
      }

      const data = await response.json();
      
      if (!data.accessToken) {
        throw new Error("No token received from session check");
      }

      setAuthentication({ state: "Authenticated", token: data.accessToken });
    } catch (ex: unknown) {
      
      if (process.env.NODE_ENV === "development" && !isCognitoEnabled && !isGoogleAuthEnabled) {
        setAuthentication({ 
          state: "Authenticated", 
          token: "development_token" 
        });
      } else {
        setAuthentication({ state: "Failed" });
      }
    }
  };

  // Mirror the active token into localStorage under the key the patients API
  // client (services/web-api/patients.ts) reads. That module was written for the
  // extension context (which stores its token as 'saip_auth_token'); in the web
  // app nothing else populates it, so /patients/* would otherwise send a stale or
  // empty token and get 401. Keep it in sync with the authenticated session.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (authentication.state === "Authenticated" && authentication.token) {
      localStorage.setItem("saip_auth_token", authentication.token);
    } else if (authentication.state === "Unauthenticated" || authentication.state === "Failed") {
      localStorage.removeItem("saip_auth_token");
    }
  }, [authentication]);

  useEffect(() => {
    if (authentication.state === "Unauthenticated" && !window.location.pathname.startsWith('/login')) {
      
      if (isCognitoEnabled || isGoogleAuthEnabled) {
        const hasSessionCookie = document.cookie.includes('berta_session=');
        
        if (!hasSessionCookie) {
          window.location.href = '/login';
          return;
        }
        startSession();
      } else if (process.env.NODE_ENV === "development") {
        setAuthentication({ 
          state: "Authenticated", 
          token: "development_token" 
        });
      } else {
        startSession();
      }
    }
  }, [authentication.state]);

  return children;
};