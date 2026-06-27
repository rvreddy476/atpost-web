# atpost-web — go-live runbook

End-to-end path (built; this doc is the order to turn it on):

```
zone source ──build-push.yml──▶ ECR atpost/web-<zone>
                                     │
shared pkgs ──publish.yml──▶ CodeArtifact (@atpost/*)
                                     │
deploy/web/<zone>/values ──ArgoCD (web-applicationset)──▶ EKS ──ALB(group atpost-web)──▶ app.cleestudio.com/<basePath>
```

Infra (Terraform/ECR/CodeArtifact/ArgoCD/ALB) lives in the **modernsmapp** repo;
the zone apps + Dockerfile + image CI live here.

---

## 0. Prerequisites (one-time)

**GitHub repo settings**
| kind | name | value |
|---|---|---|
| secret | `AWS_CI_ROLE_ARN` | `terraform output ci_role_arn` (deploy/publish/push) |
| secret | `AWS_TERRAFORM_ROLE_ARN` | privileged role for `terraform apply` (modernsmapp) |
| var | `AWS_ACCOUNT_ID` | your 12-digit account |
| var | `TF_STATE_BUCKET` / `TF_LOCK_TABLE` | from `infra/terraform/bootstrap` |

**Fill placeholders** (search `123456789012` and `CHANGEME`)
- `deploy/web/*/values-*.yaml` → real account id in `image.repository` + the ACM
  `certificate-arn`.
- `infra/terraform/envs/*/backend.tf` → uncomment + set bucket/region.

## 1. Stand up the registries (modernsmapp, Terraform)
```bash
cd modernsmapp/infra/terraform
terraform fmt -recursive                       # clears the CI fmt check
cd envs/staging && terraform init              # (after backend.tf filled)
# Just the registries first (fast; avoids the full EKS/Aurora apply):
terraform apply -target=module.codeartifact -target=module.ecr -target=module.ecr_web \
                -target=aws_iam_role_policy_attachment.ci_codeartifact
terraform output codeartifact_npm_endpoint     # sanity
```
(Or run the **Terraform → plan-apply** workflow: env=staging, command=apply.)

## 2. Publish shared packages (this repo → CodeArtifact)
```bash
bun run changeset           # describe the change, commit the .changeset/*.md
git push                    # merge to main → publish.yml runs:
                            #   OIDC → aws codeartifact login → changeset version + publish
```
Verify: the `@atpost/*` versions appear in CodeArtifact.

## 3. Build + push zone images (this repo → ECR)
Push to `main` (touching `apps/**`/`packages/**`) runs `build-push.yml` →
`atpost/web-<zone>:<sha>` + `:latest`. Or build one: **Build & push zone images**
workflow with `zone=commerce`. Locally:
```bash
docker build --build-arg ZONE=commerce -t web-commerce .
```

## 4. Deploy (modernsmapp → ArgoCD)
- Apply the web ApplicationSet once: `kubectl apply -f deploy/web-applicationset.yaml`.
- ArgoCD then reconciles one Application per `deploy/web/*` (staging→`main`,
  prod→`release/prod`) into the `atpost-web` namespace, deploying the ECR tag.
- The shared ALB (`group.name=atpost-web-<env>`) path-routes `/shop`,`/admin`,…;
  `shell` (`/`) is the catch-all (`group.order` 100). **Check rule ordering on
  first deploy** — `/` must evaluate last.

## 5. Bring the monolith in (the actual route migration)
```bash
./scripts/migrate-shell.sh          # postbook-ui → apps/shell (no codemod; @/* still resolves)
# add apps/shell host rewrites for each /zone (see MIGRATION.md), add shell to
# the build-push matrix, then per zone:
#   move postbook-ui/src/app/<domain> → apps/<zone>/src/app
#   ./scripts/codemod-dedup.sh apps/<zone>   # adopt @atpost/*, delete in-tree dupes
#   bun run build
```

## 6. Verify
- `bun install && bun run typecheck && bun run build` (all zones green) — **done locally already** for the scaffold.
- Per zone: `bun run dev` → `http://localhost:<port><basePath>` renders + auth/session works (shared apex cookie).
- Post-deploy: hit `https://app.cleestudio.com/<basePath>` per zone; cross-zone nav is a hard reload (Multi-Zones).
- Stack up + run the backend E2E suite (`modernsmapp`) to confirm gateway/auth still green.

## Placeholder checklist (must be real before prod)
- [ ] AWS account id (values + image repos)
- [ ] ACM certificate ARN (web values ingress)
- [ ] S3 backend config (envs/*/backend.tf) + `terraform fmt`
- [ ] GitHub secrets/vars (table in §0)
- [ ] `SUPERADMIN_USER_IDS` (identity-auth, from the earlier security work)
