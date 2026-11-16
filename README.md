# Snip CLI

Zero-dependency Node 20+ client. Files live at the root of the independent `cli`
branch; `main` mounts this branch as a submodule. `cli.js` must remain CommonJS
because release packaging copies it unchanged beside the Bun server.

```sh
node cli.js help
node cli.js add https://example.com
node cli.js ls
node cli.js open Ab12Cd
npm test
```

Use `./snip`, `snip.cmd`, or `./snip.ps1` as platform wrappers. A package bin
entry is also available for `npm link`. Set `SNIP_API` to an HTTP(S) origin;
default is `http://localhost:3000`. For the known local IPv6 port conflict use
`http://127.0.0.1:3000`, or run the backend on port 3100 and set that origin.

`add` posts `{url}` to `/api/links` and prints only the returned short URL.
`ls` prints an aligned code/hits/url table, or `No links yet.`.
`open` requests `/:code` with manual redirect handling, then opens its HTTP(S)
Location in the default browser. Resolving increments hits exactly once; the
CLI does not fetch the destination. Browser launch uses Windows PowerShell
Start-Process, macOS `open`, or Linux `xdg-open`, without a shell on Unix.

No arguments, `help`, `--help`, and `-h` print usage. Success exits 0; bad
arguments, invalid API responses, unknown codes, request failures, timeouts
(10 seconds), and launcher failures print to stderr and exit 1. Inputs are
validated before requests; URL credentials and whitespace are rejected.
Backend storage is in memory and resets on restart.
