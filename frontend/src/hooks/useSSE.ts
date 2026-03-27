// frontend/src/hooks/useSSE.ts
import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { fetchEventSource } from '@microsoft/fetch-event-source';
import { useAuth } from '@/contexts/AuthContext';
import { getAccessToken, setAccessToken } from '@/api/client';
import axios from 'axios';

const MAX_RETRIES = 3;

/**
 * Manages an SSE connection for live notification and job status updates.
 * Invalidates TanStack Query caches when events arrive so components
 * re-render with fresh data without polling.
 */
export function useSSE(): void {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const retryCountRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!user) return;

    const token = getAccessToken();
    if (!token) return;

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    const connect = (authToken: string) => {
      fetchEventSource('/api/v1/notifications/stream', {
        headers: { Authorization: `Bearer ${authToken}` },
        signal: ctrl.signal,
        openWhenHidden: true,

        onopen: async (response) => {
          if (response.ok) {
            retryCountRef.current = 0;
            return;
          }
          if (response.status === 401) {
            throw new Error('unauthorized');
          }
          throw new Error(`SSE open failed: ${response.status}`);
        },

        onmessage(event) {
          if (event.event === 'notification') {
            void queryClient.invalidateQueries({ queryKey: ['notifications'] });
          }

          if (event.event === 'job_status') {
            try {
              const data = JSON.parse(event.data) as {
                jobId: number;
                experimentId: number;
                status: string;
              };
              void queryClient.invalidateQueries({ queryKey: ['job', data.jobId] });
              void queryClient.invalidateQueries({
                queryKey: ['jobs', data.experimentId],
              });
              if (data.status === 'complete' || data.status === 'error') {
                void queryClient.invalidateQueries({ queryKey: ['experiments'] });
              }
            } catch {
              // Malformed event data — ignore
            }
          }
        },

        onclose() {
          // Server closed the stream — attempt reconnect with fresh token
          if (ctrl.signal.aborted) return;
          retryCountRef.current += 1;
          if (retryCountRef.current > MAX_RETRIES) return;
          void refreshAndReconnect(ctrl);
        },

        onerror(err) {
          if (ctrl.signal.aborted) throw err; // Stop retrying if unmounted

          retryCountRef.current += 1;
          if (retryCountRef.current > MAX_RETRIES) {
            throw err; // Stop retrying — fetchEventSource will close
          }

          // If unauthorized, try refreshing the token
          if (err instanceof Error && err.message === 'unauthorized') {
            void refreshAndReconnect(ctrl);
            throw err; // Stop the current connection's retry loop
          }

          // For other errors, let fetchEventSource retry with backoff
          // Return nothing to use default retry behavior
        },
      }).catch(() => {
        // fetchEventSource promise rejects when we throw in onerror/onclose
        // This is expected — the reconnect is handled by refreshAndReconnect
      });
    };

    const refreshAndReconnect = async (abortCtrl: AbortController) => {
      if (abortCtrl.signal.aborted) return;
      try {
        const res = await axios.post('/api/v1/auth/refresh', {});
        const newToken = res.data.accessToken as string;
        setAccessToken(newToken);
        if (!abortCtrl.signal.aborted) {
          connect(newToken);
        }
      } catch {
        // Refresh failed — user will need to re-login
      }
    };

    connect(token);

    return () => {
      ctrl.abort();
      abortRef.current = null;
    };
  }, [user, queryClient]);
}
