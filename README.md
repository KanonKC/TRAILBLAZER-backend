# TRAILBLAZER Backend

[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Fastify](https://img.shields.io/badge/fastify-202020?style=for-the-badge&logo=fastify&logoColor=white)](https://www.fastify.io/)
[![Prisma](https://img.shields.io/badge/Prisma-3982CE?style=for-the-badge&logo=Prisma&logoColor=white)](https://www.prisma.io/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-316192?style=for-the-badge&logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Redis](https://img.shields.io/badge/redis-%23DD0031.svg?style=for-the-badge&logo=redis&logoColor=white)](https://redis.io/)

The core backend service for **TRAILBLAZER**, providing a robust API for Twitch content management, video exports, and user integrations. Built with high performance and reliability in mind using Fastify and Prisma.

---

## 🚀 Key Features

- **Twitch Integration**: Advanced handling of Twitch clips, video exports, and EventSub subscriptions using Twurple.
- **Unified Authentication**: Secure JWT-based authentication with support for Twitch, YouTube, and Discord OAuth.
- **Video Processing**: Automated video export pipelines with S3 storage integration.
- **Real-time Updates**: SSE (Server-Sent Events) support for live progress tracking.
- **Scheduled Tasks**: Robust cron job system for background maintenance and automated workflows.
- **Structured Logging**: Deep observability with New Relic enriched structured logging.

---

## 🛠 Tech Stack

- **Framework**: [Fastify](https://www.fastify.io/) (High-performance web framework)
- **Language**: [TypeScript](https://www.typescriptlang.org/)
- **Database**: [PostgreSQL](https://www.postgresql.org/) with [Prisma ORM](https://www.prisma.io/)
- **Caching/Queue**: [Redis](https://redis.io/)
- **Storage**: [AWS S3](https://aws.amazon.com/s3/) (Compatible storage)
- **Observability**: [New Relic](https://newrelic.com/) & [Winston](https://github.com/winstonjs/winston)
- **Validation**: [Zod](https://zod.dev/)

---

## 📋 Prerequisites

- **Node.js**: `v20.x` or higher
- **PostgreSQL**: `v15.x` or higher
- **Redis**: `v7.x` or higher
- **Docker**: (Optional) For containerized development

---

## ⚙️ Installation & Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/KanonKC/TRAILBLAZER-backend.git
   cd TRAILBLAZER-backend
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Environment Configuration**
   Copy the example environment file and fill in your credentials:
   ```bash
   cp example.env .env
   ```
   > [!IMPORTANT]
   > Ensure `DATABASE_URL` and `REDIS_URL` are correctly set before proceeding.

4. **Database Setup**
   Run Prisma migrations to set up your schema:
   ```bash
   npx prisma migrate dev
   ```

---

## 🏃 Running the Application

| Command | Description |
| :--- | :--- |
| `npm run dev` | Start development server with nodemon |
| `npm run dev:log` | Start dev server with New Relic and logging enabled |
| `npm run build` | Compile TypeScript to JavaScript |
| `npm run start` | Run the production build |
| `npm run test` | Execute Jest test suite |

---

## 📐 Architecture

The project follows a standard layered architecture:

- `src/controllers`: Request handling and response formatting.
- `src/services`: Core business logic and orchestration.
- `src/repositories`: Data access layer using Prisma.
- `src/providers`: External API clients (Twitch, AWS, Spotify).
- `src/libs`: Shared library configurations (Redis, Prisma client).
- `src/logging`: Custom structured logging implementation (`TLogger`).

---

## 🪵 Logging Standards

This project uses a mandatory structured logging format via the `TLogger` wrapper. All logs are enriched with layer, context, and transaction metadata.

```typescript
import TLogger, { Layer } from "@/logging/logger";
const logger = new TLogger(Layer.SERVICE);

logger.setContext("domain.feature.action");
logger.info({ 
    message: "Action successful", 
    data: { id: 123 } 
});
```

> [!NOTE]
> For detailed logging rules, refer to [logging-format.md](.agent/rules/logging-format.md) (if available in your dev environment).

---

## 🐳 Docker Support

To run the full stack using Docker Compose:

```bash
docker-compose up -d
```

---

## 📄 License

This project is licensed under the **ISC License**.
