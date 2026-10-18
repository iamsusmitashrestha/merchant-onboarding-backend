import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAuditLogs1792312585649 implements MigrationInterface {
  name = 'CreateAuditLogs1792312585649';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."audit_action_enum" AS ENUM('APPLICATION_CREATED', 'APPLICATION_UPDATED', 'APPLICATION_SUBMITTED', 'REVIEWER_ASSIGNED', 'RISK_ASSESSMENT_COMPLETED', 'RISK_ASSESSMENT_FAILED', 'RISK_REVIEW_RETRIED', 'DECISION_RECORDED', 'LOGIN_SUCCEEDED', 'LOGIN_FAILED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "audit_logs" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "actor_id" uuid, "actor_role" character varying(16) NOT NULL, "action" "public"."audit_action_enum" NOT NULL, "entity_type" character varying(50) NOT NULL, "entity_id" uuid, "metadata" jsonb NOT NULL, "request_id" character varying(100), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "pk_audit_logs" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_audit_logs_actor_id_created_at" ON "audit_logs" ("actor_id", "created_at") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_audit_logs_entity_type_entity_id_created_at" ON "audit_logs" ("entity_type", "entity_id", "created_at") `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."idx_audit_logs_entity_type_entity_id_created_at"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."idx_audit_logs_actor_id_created_at"`,
    );
    await queryRunner.query(`DROP TABLE "audit_logs"`);
    await queryRunner.query(`DROP TYPE "public"."audit_action_enum"`);
  }
}
