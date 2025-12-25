// src/components/ExportCSVButton.jsx
import React from "react";
import { downloadCSV } from "../api";

export default function ExportCSVButton({ data, filename = "export.csv", children = "Export CSV" }) {
  function onClick() {
    downloadCSV(data, filename);
  }
  return (
    <button onClick={onClick} className="px-3 py-1 rounded bg-indigo-600 text-white text-sm hover:bg-indigo-700">
      {children}
    </button>
  );
}
