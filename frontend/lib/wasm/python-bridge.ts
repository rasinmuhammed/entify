import { AsyncDuckDB } from '@duckdb/duckdb-wasm'

export async function executePython(pyodide: any, code: string, globals: any = {}) {
    // Basic wrapper for now
    for (const [key, value] of Object.entries(globals)) {
        pyodide.globals.set(key, value);
    }
    return await pyodide.runPythonAsync(code);
}

export async function resultToArrow(duckDB: AsyncDuckDB, query: string) {
    // Helper to get arrow result from DuckDB
    const conn = await duckDB.connect();
    const result = await conn.query(query);
    await conn.close();
    return result;
}
