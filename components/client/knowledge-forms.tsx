"use client";

import { useState } from "react";
import { btn, cx, input } from "@/components/ui";
import { useAction } from "./api";

export function PriceForm({ capabilityId, currentMinor }: { capabilityId: string; currentMinor: number }) {
  const { run, pending, error } = useAction();
  const [value, setValue] = useState((currentMinor / 100).toFixed(2));
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        void run(`/api/capabilities/${capabilityId}/price`, { priceMinor: Math.round(Number(value) * 100) });
      }}
    >
      <label className="text-sm">
        <span className="text-xs text-ink-3">New price (USD)</span>
        <input
          className={cx(input, "mt-1 w-32 tabular")}
          inputMode="decimal"
          value={value}
          onChange={(e) => setValue(e.target.value.replace(/[^\d.]/g, ""))}
        />
      </label>
      <button type="submit" className={btn.secondary} disabled={pending}>
        Save as new version
      </button>
      {error ? (
        <p role="alert" className="basis-full text-sm text-red">
          {error}
        </p>
      ) : null}
    </form>
  );
}

export function NewSourceForm() {
  const { run, pending, error } = useAction();
  const [docKey, setDocKey] = useState("");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [tags, setTags] = useState("");
  const [sourceType, setSourceType] = useState("policy");
  const [visibility, setVisibility] = useState("buyer_visible");
  const [trust, setTrust] = useState("authored");
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        void run(
          "/api/knowledge",
          {
            docKey,
            title,
            content,
            sourceType,
            visibility,
            trust,
            tags: tags
              .split(",")
              .map((t) => t.trim())
              .filter(Boolean),
          },
          () => {
            setContent("");
          },
        );
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <input
          aria-label="Document key"
          className={input}
          placeholder="doc key, e.g. crm-write-policy"
          value={docKey}
          onChange={(e) => setDocKey(e.target.value)}
        />
        <input aria-label="Title" className={input} placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <textarea
        aria-label="Content"
        rows={4}
        className={input}
        placeholder="Content (treated as data; instruction-like text is flagged and ignored)"
        value={content}
        onChange={(e) => setContent(e.target.value)}
      />
      <div className="grid gap-3 sm:grid-cols-4">
        <input
          aria-label="Tags"
          className={input}
          placeholder="tags: hubspot, crm_write"
          value={tags}
          onChange={(e) => setTags(e.target.value)}
        />
        <select aria-label="Source type" className={input} value={sourceType} onChange={(e) => setSourceType(e.target.value)}>
          <option value="policy">policy</option>
          <option value="connector_note">connector_note</option>
          <option value="offering">offering</option>
          <option value="uploaded_document">uploaded_document</option>
        </select>
        <select aria-label="Visibility" className={input} value={visibility} onChange={(e) => setVisibility(e.target.value)}>
          <option value="buyer_visible">buyer_visible</option>
          <option value="seller_internal">seller_internal</option>
        </select>
        <select aria-label="Trust" className={input} value={trust} onChange={(e) => setTrust(e.target.value)}>
          <option value="authored">authored</option>
          <option value="untrusted_upload">untrusted_upload</option>
        </select>
      </div>
      <button type="submit" className={btn.primary} disabled={pending}>
        Add version
      </button>
      {error ? (
        <p role="alert" className="text-sm text-red">
          {error}
        </p>
      ) : null}
    </form>
  );
}
