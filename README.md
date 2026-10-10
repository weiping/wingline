# Wingline 雁阵

Persistent, role-based agent teams on top of [Orca](https://github.com/stablyai/orca).

Wingline adds a team layer to Orca: a declarative team spec, long-lived posts (`builder@duo`), automatic review chains, quality gates, budgets and circuit breakers, restart recovery, and a local console opened inside Orca's built-in browser. It drives Orca only through `orca … --json` — no fork, no plugin back doors, no second process supervisor.

雁阵在 Orca 之上加一层“常驻团队”：团队规格、固定岗位、自动审查链、质量闸门、预算与熔断、重启恢复，以及在 Orca 内置浏览器里打开的控制台。

> Status: design stage. No code yet.

- Design spec: [docs/superpowers/specs/2026-10-10-wingline-design.md](docs/superpowers/specs/2026-10-10-wingline-design.md)
- Implementation plans: [docs/superpowers/plans/](docs/superpowers/plans/)

## License

[MIT](LICENSE)
