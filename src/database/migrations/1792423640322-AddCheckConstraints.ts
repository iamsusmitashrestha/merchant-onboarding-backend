import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCheckConstraints1792423640322 implements MigrationInterface {
  name = 'AddCheckConstraints1792423640322';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "merchant_applications" ADD CONSTRAINT "chk_merchant_applications_submission_version_non_negative" CHECK ("submission_version" >= 0)`,
    );
    await queryRunner.query(
      `ALTER TABLE "merchant_applications" ADD CONSTRAINT "chk_merchant_applications_currency_format" CHECK ("currency" ~ '^[A-Z]{3}$')`,
    );
    await queryRunner.query(
      `ALTER TABLE "merchant_applications" ADD CONSTRAINT "chk_merchant_applications_mcc_format" CHECK ("mcc" ~ '^[0-9]{4}$')`,
    );
    await queryRunner.query(
      `ALTER TABLE "merchant_applications" ADD CONSTRAINT "chk_merchant_applications_amounts_non_negative" CHECK ("expected_monthly_volume_minor" >= 0 AND "average_ticket_minor" >= 0)`,
    );
    await queryRunner.query(
      `ALTER TABLE "risk_assessments" ADD CONSTRAINT "chk_risk_assessments_score_range" CHECK ("score" BETWEEN 0 AND 100)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "risk_assessments" DROP CONSTRAINT "chk_risk_assessments_score_range"`,
    );
    await queryRunner.query(
      `ALTER TABLE "merchant_applications" DROP CONSTRAINT "chk_merchant_applications_amounts_non_negative"`,
    );
    await queryRunner.query(
      `ALTER TABLE "merchant_applications" DROP CONSTRAINT "chk_merchant_applications_mcc_format"`,
    );
    await queryRunner.query(
      `ALTER TABLE "merchant_applications" DROP CONSTRAINT "chk_merchant_applications_currency_format"`,
    );
    await queryRunner.query(
      `ALTER TABLE "merchant_applications" DROP CONSTRAINT "chk_merchant_applications_submission_version_non_negative"`,
    );
  }
}
