export interface HeadProps {
  columnConfig: ColumnConfigType[];
  hasActions: boolean;
  canDelete?: boolean;
  dynamicColumnWidth?: number | string;
}
