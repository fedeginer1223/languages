import type { Table } from '@tanstack/react-table';
import { Search, SlidersHorizontal, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { DataTableColumnMeta } from './types';

interface DataTableToolbarProps<TData> {
  table: Table<TData>;
  globalFilter: string;
  onGlobalFilterChange: (value: string) => void;
  searchPlaceholder?: string;
  enableColumnVisibility?: boolean;
  toolbarLeft?: React.ReactNode;
  toolbarRight?: React.ReactNode;
}

export function DataTableToolbar<TData>({
  table,
  globalFilter,
  onGlobalFilterChange,
  searchPlaceholder = "Buscar...",
  enableColumnVisibility = true,
  toolbarLeft,
  toolbarRight,
}: DataTableToolbarProps<TData>) {
  const hasActiveFilters = table.getState().columnFilters.length > 0 || globalFilter.length > 0;

  const clearAllFilters = () => {
    table.resetColumnFilters();
    onGlobalFilterChange('');
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* Global search */}
      <div className="relative flex-1 min-w-[200px] max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder={searchPlaceholder}
          value={globalFilter}
          onChange={(e) => onGlobalFilterChange(e.target.value)}
          className="pl-9 h-9"
        />
      </div>

      {/* Clear all filters */}
      {hasActiveFilters && (
        <Button
          variant="ghost"
          size="sm"
          onClick={clearAllFilters}
          className="h-9 gap-1 text-muted-foreground"
        >
          <X className="h-3.5 w-3.5" />
          Limpiar filtros
        </Button>
      )}

      {/* Custom left slot */}
      {toolbarLeft}

      <div className="flex-1" />

      {/* Column visibility toggle */}
      {enableColumnVisibility && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-9 gap-2">
              <SlidersHorizontal className="h-3.5 w-3.5" />
              Columnas
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            {table.getAllLeafColumns()
              .filter((column) => {
                const meta = column.columnDef.meta as DataTableColumnMeta | undefined;
                return meta?.canHide !== false && column.id !== 'actions';
              })
              .map((column) => {
                const meta = column.columnDef.meta as DataTableColumnMeta | undefined;
                const displayName = meta?.displayName || (typeof column.columnDef.header === 'string' ? column.columnDef.header : column.id);
                return (
                  <DropdownMenuCheckboxItem
                    key={column.id}
                    checked={column.getIsVisible()}
                    onCheckedChange={(value) => column.toggleVisibility(!!value)}
                  >
                    {displayName}
                  </DropdownMenuCheckboxItem>
                );
              })}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {/* Custom right slot */}
      {toolbarRight}
    </div>
  );
}
