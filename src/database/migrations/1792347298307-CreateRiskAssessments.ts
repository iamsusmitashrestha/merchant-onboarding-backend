import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateRiskAssessments1792347298307 implements MigrationInterface {
  name = 'CreateRiskAssessments1792347298307';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "risk_assessments" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "application_id" uuid NOT NULL, "submission_version" integer NOT NULL, "score" integer NOT NULL, "level" "public"."risk_level_enum" NOT NULL, "reasons" jsonb NOT NULL, "provider_reference" character varying(100) NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "uq_risk_assessments_application_id_submission_version" UNIQUE ("application_id", "submission_version"), CONSTRAINT "pk_risk_assessments" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "risk_assessments" ADD CONSTRAINT "fk_risk_assessments_application_id" FOREIGN KEY ("application_id") REFERENCES "merchant_applications"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "risk_assessments" DROP CONSTRAINT "fk_risk_assessments_application_id"`,
    );
    await queryRunner.query(`DROP TABLE "risk_assessments"`);
  }
}
