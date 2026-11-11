# Contributing to Brush

Thank you for contributing to Brush. To protect our live e-commerce production environment (`brush-art.in`), direct pushes and unverified deployments to the `main` branch are strictly prohibited.

---

## 🔒 Branch & Deployment Protection Policy

1. **`main` is Production**: The `main` branch directly feeds our live production deployment on **Vercel** and **Render**.
2. **No Direct Pushes**: All developers (including collaborators) must develop on isolated topic/feature branches and open a Pull Request.
3. **Mandatory Owner Review**: Per [`.github/CODEOWNERS`](.github/CODEOWNERS), all pull requests require review and explicit sign-off from **@ImMortaL0P** before any merge can take place.
4. **Mandatory Automated Quality Gates**: The CI verification suite (`npm test`) must pass cleanly on GitHub Actions before a PR can be merged.

---

## 🛠️ Development Workflow

### 1. Create a Feature Branch
Always branch off the latest `main`:

```bash
git checkout main
git pull origin main
git checkout -b feat/your-feature-name
# or for bugfixes:
git checkout -b fix/issue-description
```

### 2. Local Testing & Verification
Before pushing changes, run the automated test suite to ensure pricing calculations and AR contracts match:

```bash
npm test
```

If you modified catalog items or pricing structures, ensure cart parity:
```bash
python3 tools/sync-cart-config.py
npm test
```

### 3. Open a Pull Request
Push your branch to GitHub:
```bash
git push -u origin feat/your-feature-name
```
Navigate to GitHub and open a Pull Request against the `main` branch. Fill in the Pull Request checklist provided in the template.

### 4. Vercel Preview Deployments
Upon opening a Pull Request, Vercel will automatically generate a sandboxed **Preview Deployment URL**. Use this preview URL to test your changes live in a non-production environment.

### 5. Review & Merge
Once **@ImMortaL0P** reviews and verifies the code changes and all CI checks pass, the PR will be merged into `main`, which automatically deploys the update to production.
