import * as React from "react";
import { Check, ChevronDown, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";

export interface MultiSelectOption {
  value: string;
  label: string;
}

// Standalone list of checkboxes (no popover wrapper)
interface MultiSelectListProps {
  options: MultiSelectOption[];
  selected: string[];
  onChange: (selected: string[]) => void;
  className?: string;
}

export function MultiSelectList({
  options,
  selected,
  onChange,
  className,
}: MultiSelectListProps) {
  const toggleOption = (value: string) => {
    if (selected.includes(value)) {
      onChange(selected.filter((v) => v !== value));
    } else {
      onChange([...selected, value]);
    }
  };

  return (
    <div className={cn("max-h-60 overflow-y-auto", className)}>
      {options.map((option) => {
        const isSelected = selected.includes(option.value);
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => toggleOption(option.value)}
            className={cn(
              "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm cursor-pointer hover:bg-accent hover:text-accent-foreground",
              isSelected && "bg-accent/50"
            )}
          >
            <div
              className={cn(
                "flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border border-primary",
                isSelected
                  ? "bg-primary text-primary-foreground"
                  : "opacity-50"
              )}
            >
              {isSelected && <Check className="h-3 w-3" />}
            </div>
            <span>{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}

// Full MultiSelect with popover trigger
interface MultiSelectProps {
  options: MultiSelectOption[];
  selected: string[];
  onChange: (selected: string[]) => void;
  placeholder?: string;
  icon?: React.ReactNode;
  className?: string;
}

export function MultiSelect({
  options,
  selected,
  onChange,
  placeholder = "Seleccionar...",
  icon,
  className,
}: MultiSelectProps) {
  const [open, setOpen] = React.useState(false);

  const clearAll = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange([]);
  };

  const selectedLabels = selected
    .map((v) => options.find((o) => o.value === v)?.label)
    .filter(Boolean);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
            className
          )}
        >
          <div className="flex items-center gap-2 flex-1 min-w-0">
            {icon && <span className="shrink-0">{icon}</span>}
            {selected.length === 0 ? (
              <span className="text-muted-foreground">{placeholder}</span>
            ) : selected.length <= 2 ? (
              <div className="flex gap-1 flex-wrap">
                {selectedLabels.map((label) => (
                  <Badge key={label} variant="secondary" className="text-xs px-1.5 py-0">
                    {label}
                  </Badge>
                ))}
              </div>
            ) : (
              <Badge variant="secondary" className="text-xs px-1.5 py-0">
                {selected.length} seleccionados
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0 ml-2">
            {selected.length > 0 && (
              <X
                className="h-4 w-4 text-muted-foreground hover:text-foreground cursor-pointer"
                onClick={clearAll}
              />
            )}
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          </div>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-1" align="start">
        <MultiSelectList
          options={options}
          selected={selected}
          onChange={onChange}
        />
      </PopoverContent>
    </Popover>
  );
}
