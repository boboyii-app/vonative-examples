'use client';

import { useRef } from 'react';
import { useVonativeEvents } from '@vonative/react';
import type { IntakeFormData } from '@/lib/form-fields';
import { isValidFieldName } from '@/lib/form-fields';

interface UseRpcHandlersOptions {
  isConnected: boolean;
  formData: IntakeFormData;
  setFormData: (data: IntakeFormData | ((prev: IntakeFormData) => IntakeFormData)) => void;
  setIsSubmitted: (submitted: boolean) => void;
}

export function useRpcHandlers({
  isConnected,
  formData,
  setFormData,
  setIsSubmitted,
}: UseRpcHandlersOptions) {
  const formDataRef = useRef(formData);
  formDataRef.current = formData;

  useVonativeEvents({
    onClientEvent: (eventType, payload) => {
      if (!isConnected) return;

      // 1) Direct event mapping
      if (eventType === 'updateField') {
        const { fieldName, value } = payload as {
          fieldName: string;
          value: string;
        };
        if (isValidFieldName(fieldName)) {
          setFormData((prev) => ({ ...prev, [fieldName]: value }));
        }
      }

      if (eventType === 'submitForm') {
        setIsSubmitted(true);
      }

      // 2) Generic perform_rpc mapping ("client_event")
      if (eventType === 'client_event' || eventType === 'perform_rpc') {
        const { action, fieldName, value } = payload as any;
        if (action === 'updateField' && fieldName && value) {
          if (isValidFieldName(fieldName)) {
            setFormData((prev) => ({ ...prev, [fieldName]: value }));
          }
        }
        if (action === 'submitForm') {
          setIsSubmitted(true);
        }
      }
    },
  });
}
