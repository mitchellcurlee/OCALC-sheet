# Test Credentials

## Master Admin (sees all jobs from @mastec.com and @byers.com users)
- Email: Admin@mastec.com
- Password: Mastecbyers12345

## Regular User
- Email: mitchell.curlee@byers.com
- Password: Dawson@2016

Notes:
- Admin@mastec.com is the MASTER ADMIN and can view all jobs from @mastec.com and @byers.com users
- tim.gables@byers.com access has been terminated
- Existing seed job id: e5dc0bae-96bb-4cef-8001-7baf4e41d80a (A050ABC)

## Verified synapsiq.com test user (created 2026-06 during domain/verification work)
- Email: qa.tester@synapsiq.com
- Password: secret123

## Access rules (2026-06)
- Allowed domains: mastec.com, byers.com, mastecbyers.com, synapsiq.com, mastecindia.com (services/auth.py ALLOWED_DOMAINS)
- New registrations get `email_verified:false` + emailed link `/verify-email?token=...`; login returns 403 `EMAIL_NOT_VERIFIED` until verified. Existing users (no `email_verified` field) are grandfathered.
- For tests, the verification token can be read from Mongo `users.verification_token`.
