"use client";

import { useState } from "react";
import { PencilIcon, ListIcon } from "lucide-react";

import { NativeSelect } from "@/components/native-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useProviderModels } from "@/hooks/use-provider-models";
import type { ProviderKey } from "@/lib/types";

interface ModelSelectProps {
  provider: ProviderKey;
  value: string;
  onChange: (model: string) => void;
  /** Modelos a mostrar mientras se cargan los del proveedor. */
  fallbackModels?: string[];
  /** Texto de ejemplo del modelo por defecto del proveedor. */
  placeholder?: string;
}

/**
 * Selector de modelo: muestra una lista visible con los modelos reales del
 * proveedor y permite escribir un modelo personalizado si no aparece.
 */
export function ModelSelect({
  provider,
  value,
  onChange,
  fallbackModels = [],
  placeholder = "",
}: ModelSelectProps) {
  const models = useProviderModels(provider, fallbackModels);
  const [customMode, setCustomMode] = useState(false);

  const inList = models.includes(value);
  const showList = !customMode && (inList || !value);

  if (!showList) {
    return (
      <div className="flex items-center gap-2">
        <Input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setCustomMode(false)}
          aria-label="Elegir de la lista"
        >
          <ListIcon />
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <NativeSelect
        value={inList || !value ? value : ""}
        onChange={(event) => onChange(event.target.value)}
      >
        {!inList ? (
          <option value="">{value ? `${value} (personalizado)` : "Elige un modelo…"}</option>
        ) : null}
        {models.map((model) => (
          <option key={model} value={model}>
            {model}
          </option>
        ))}
      </NativeSelect>

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setCustomMode(true)}
        aria-label="Escribir modelo personalizado"
      >
        <PencilIcon />
      </Button>
    </div>
  );
}
