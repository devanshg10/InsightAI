export function buildColumnOptions(columnNames = []) {
  return columnNames.map((column) => ({ label: column, value: column }));
}

export function hasColumns(columnNames = []) {
  return columnNames.length > 0;
}
