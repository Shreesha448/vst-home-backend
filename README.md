# VST Homepage Backend — CI Pipeline

Production-grade CI pipeline with testing, security 
scanning, and Docker image build/push via GitHub Actions.

## Pipeline Flow
Push/PR to main → Install & Test → Dependency Scan 
→ Docker Build → Trivy Security Scan → Push to DockerHub

## Tech Stack
- GitHub Actions (CI)
- Node.js 18
- Docker + DockerHub
- Trivy (Container Security Scanning)
- npm audit (Dependency Vulnerability Scanning)

## Pipeline Stages
| Stage | Tool | Purpose |
|-------|------|---------|
| Test | npm test | Run unit tests |
| Dependency Scan | npm audit | Check for vulnerabilities |
| Build | Docker | Build container image |
| Image Scan | Trivy | Scan image for CVEs |
| Push | DockerHub | Publish versioned image |

## Secrets Required
| Secret | Description |
|--------|-------------|
| DOCKERHUB_USERNAME | DockerHub username |
| DOCKERHUB_TOKEN | DockerHub access token |

## Triggers
- Push to `main`
- Pull Request to `main`
- Manual trigger via GitHub Actions UI
