import React from 'react';
import ReactDataTable from 'react-data-table-component';

const defaultPaginationRowsPerPageOptions = [10, 25, 50, 100];
const defaultPaginationComponentOptions = {
  rowsPerPageText: 'Rows per page',
  rangeSeparatorText: 'of',
  selectAllRowsItem: true,
  selectAllRowsItemText: 'All',
};

const DataTable = ({
  paginationRowsPerPageOptions = defaultPaginationRowsPerPageOptions,
  paginationComponentOptions = {},
  ...props
}) => (
  <ReactDataTable
    {...props}
    paginationRowsPerPageOptions={paginationRowsPerPageOptions}
    paginationComponentOptions={{
      ...defaultPaginationComponentOptions,
      ...paginationComponentOptions,
    }}
  />
);

export default DataTable;
