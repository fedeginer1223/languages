import { useState } from 'react';
import { flexRender } from '@tanstack/react-table';
import type { Header } from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ArrowUpDown, Filter, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { MultiSelectList } from '@/components/ui/multi-select';
import { Input } from '@/components/ui/Input';
import type { DataTableColumnMeta } from './types';

interface DataTableColumnHeaderProps<TData> {
  header: Header<TData, unknown>;
}

export function DataTableColumnHeader<TData>({ header }: DataTableColumnHeaderProps<TData>) {
  const column = header.column;
  const meta = column.columnDef.meta as DataTableColumnMeta | undefined;
  const filterOptions = meta?.filterOptions;
  const canSort = column.getCanSort();
  const filterValue = (column.getFilterValue() as string[]) ?? [];
  const hasActiveFilter = filterValue.length > 0;
  const align = meta?.align ?? 'left';
  const [filterSearch, setFilterSearch] = useState('');

  const alignClass = align === 'center' ? 'justify-center' : align === 'right' ? 'justify-end' : 'justify-start';

  // Filter options by search term
  const filteredOptions = filterOptions?.filter((opt) =>
    !filterSearch || opt.label.toLowerCase().includes(filterSearch.toLowerCase())
  );

  return (
    <th
      style={{ position: 'relative' }}
      className={cn(
        "h-8 px-2 text-left align-middle font-medium text-muted-foreground text-xs whitespace-nowrap select-none group/header",
        "border-b border-border bg-muted/30"
      )}
    >
      <div className={cn("flex items-center gap-1", alignClass)}>
        {/* Sort toggle + header text */}
        {canSort ? (
          <button
            type="button"
            onClick={column.getToggleSortingHandler()}
            className="flex items-center gap-1 hover:text-foreground transition-colors"
          >
            {flexRender(column.columnDef.header, header.getContext())}
            {column.getIsSorted() === 'asc' ? (
              <ArrowUp className="h-3 w-3" />
            ) : column.getIsSorted() === 'desc' ? (
              <ArrowDown className="h-3 w-3" />
            ) : (
              <ArrowUpDown className="h-3 w-3 opacity-40" />
            )}
          </button>
        ) : (
          <span>{flexRender(column.columnDef.header, header.getContext())}</span>
        )}

        {/* Text filter (no filterOptions, but column can filter) */}
        {!filterOptions && column.getCanFilter() && (
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className={cn(
                  "ml-1 p-0.5 rounded hover:bg-accent transition-colors",
                  (column.getFilterValue() as string) && "text-primary"
                )}
              >
                <Filter className="h-3 w-3" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-52 p-2" align="start">
              <div className="space-y-2">
                <Input
                  placeholder="Filtrar..."
                  value={(column.getFilterValue() as string) ?? ''}
                  onChange={(e) => column.setFilterValue(e.target.value || undefined)}
                  className="h-8 text-xs"
                  autoFocus
                />
                {(column.getFilterValue() as string) && (
                  <button
                    type="button"
                    onClick={() => column.setFilterValue(undefined)}
                    className="w-full text-xs text-muted-foreground hover:text-foreground py-1 border-t"
                  >
                    Limpiar filtro
                  </button>
                )}
              </div>
            </PopoverContent>
          </Popover>
        )}

        {/* Multi-select filter (with filterOptions) */}
        {filterOptions && filterOptions.length > 0 && (
          <Popover onOpenChange={(open) => { if (!open) setFilterSearch(''); }}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className={cn(
                  "ml-1 p-0.5 rounded hover:bg-accent transition-colors",
                  hasActiveFilter && "text-primary"
                )}
              >
                <Filter className="h-3 w-3" />
                {hasActiveFilter && (
                  <span className="absolute -top-1 -right-1 bg-primary text-primary-foreground text-[9px] rounded-full w-3.5 h-3.5 flex items-center justify-center font-bold">
                    {filterValue.length}
                  </span>
                )}
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-52 p-1" align="start">
              {/* Search input */}
              <div className="relative px-1 pb-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Buscar..."
                  value={filterSearch}
                  onChange={(e) => setFilterSearch(e.target.value)}
                  className="h-8 pl-8 text-xs"
                />
              </div>
              <MultiSelectList
                options={filteredOptions || []}
                selected={filterValue}
                onChange={(values) => column.setFilterValue(values.length ? values : undefined)}
              />
              {hasActiveFilter && (
                <button
                  type="button"
                  onClick={() => column.setFilterValue(undefined)}
                  className="w-full text-xs text-muted-foreground hover:text-foreground py-1.5 px-2 border-t mt-1"
                >
                  Limpiar filtro
                </button>
              )}
            </PopoverContent>
          </Popover>
        )}
      </div>

    </th>
  );
}
