import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateMerchantApplications1792315014399 implements MigrationInterface {
  name = 'CreateMerchantApplications1792315014399';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."business_type_enum" AS ENUM('SOLE_PROPRIETORSHIP', 'PARTNERSHIP', 'LLC', 'CORPORATION', 'NON_PROFIT')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."application_status_enum" AS ENUM('DRAFT', 'SUBMITTED', 'IN_REVIEW', 'INFO_REQUESTED', 'APPROVED', 'REJECTED')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."risk_status_enum" AS ENUM('NOT_STARTED', 'PENDING', 'COMPLETED', 'FAILED')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."risk_level_enum" AS ENUM('LOW', 'MEDIUM', 'HIGH')`,
    );
    await queryRunner.query(
      `CREATE TABLE "merchant_applications" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "business_name" character varying(200) NOT NULL, "legal_business_name" character varying(200) NOT NULL, "business_type" "public"."business_type_enum" NOT NULL, "owner_name" character varying(200) NOT NULL, "owner_email" character varying(320) NOT NULL, "owner_phone" character varying(32) NOT NULL, "tax_id" character varying(32) NOT NULL, "mcc" character varying(4) NOT NULL, "currency" character varying(3) NOT NULL, "expected_monthly_volume_minor" bigint NOT NULL, "average_ticket_minor" bigint NOT NULL, "status" "public"."application_status_enum" NOT NULL DEFAULT 'DRAFT', "risk_status" "public"."risk_status_enum" NOT NULL DEFAULT 'NOT_STARTED', "risk_level" "public"."risk_level_enum", "decision_reason" text, "created_by_id" uuid NOT NULL, "assigned_reviewer_id" uuid, "submission_version" integer NOT NULL DEFAULT '0', "version" integer NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "submitted_at" TIMESTAMP WITH TIME ZONE, "decided_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "pk_merchant_applications" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_merchant_applications_assigned_reviewer_id" ON "merchant_applications" ("assigned_reviewer_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_merchant_applications_status_created_at" ON "merchant_applications" ("status", "created_at") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_merchant_applications_created_by_id_created_at" ON "merchant_applications" ("created_by_id", "created_at") `,
    );
    await queryRunner.query(
      `ALTER TABLE "merchant_applications" ADD CONSTRAINT "fk_merchant_applications_created_by_id" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "merchant_applications" ADD CONSTRAINT "fk_merchant_applications_assigned_reviewer_id" FOREIGN KEY ("assigned_reviewer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "merchant_applications" DROP CONSTRAINT "fk_merchant_applications_assigned_reviewer_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "merchant_applications" DROP CONSTRAINT "fk_merchant_applications_created_by_id"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."idx_merchant_applications_created_by_id_created_at"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."idx_merchant_applications_status_created_at"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."idx_merchant_applications_assigned_reviewer_id"`,
    );
    await queryRunner.query(`DROP TABLE "merchant_applications"`);
    await queryRunner.query(`DROP TYPE "public"."risk_level_enum"`);
    await queryRunner.query(`DROP TYPE "public"."risk_status_enum"`);
    await queryRunner.query(`DROP TYPE "public"."application_status_enum"`);
    await queryRunner.query(`DROP TYPE "public"."business_type_enum"`);
  }
}
