FROM oven/bun:1.4.4-alpine@sha256:4cf82f5686b196504fe119db3fcd9185b191f82ece82c40680e597228ec6070a
WORKDIR /app
COPY --chown=bun:bun . .
ENV PORT=3000 PUBLIC_DIR=./public
USER bun
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s CMD bun -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/links').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["bun", "server.js"]
