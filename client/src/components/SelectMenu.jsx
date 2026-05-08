import { useEffect, useRef, useState } from "react";

export function SelectMenu({
  value,
  options,
  onChange,
  placeholder = "Выберите значение",
  disabled = false,
  className = ""
}) {
  const containerRef = useRef(null);
  const [open, setOpen] = useState(false);
  const selectedOption = options.find((option) => option.value === value) ?? null;

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const handlePointerDown = (event) => {
      if (!containerRef.current?.contains(event.target)) {
        setOpen(false);
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, [open]);

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <button
        type="button"
        className="select-menu-trigger"
        data-open={open ? "true" : "false"}
        onClick={() => {
          if (!disabled) {
            setOpen((current) => !current);
          }
        }}
        disabled={disabled}
      >
        <span className="min-w-0 text-left">
          <span className={`block truncate text-sm font-medium ${selectedOption ? "text-ink" : "text-slate-400"}`}>
            {selectedOption?.label ?? placeholder}
          </span>
          {selectedOption?.description ? (
            <span className="mt-1 block truncate text-xs text-slate-500">
              {selectedOption.description}
            </span>
          ) : null}
        </span>
        <span className="select-menu-chevron" data-open={open ? "true" : "false"} />
      </button>

      {open && !disabled ? (
        <div className="select-menu-panel">
          {options.map((option) => (
            <button
              key={`${option.value}-${option.label}`}
              type="button"
              className="select-menu-option"
              data-active={option.value === value ? "true" : "false"}
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
            >
              <span className="block text-sm font-semibold text-ink">{option.label}</span>
              {option.description ? (
                <span className="mt-1 block text-xs text-slate-500">{option.description}</span>
              ) : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
