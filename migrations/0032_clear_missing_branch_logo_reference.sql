-- Clear the confirmed missing branch branding object so all document consumers
-- immediately fall back to company branding. The API also validates future
-- branch logo references before returning them.
UPDATE branches
SET logo_url = NULL
WHERE logo_url IN (
  'uploads/bc6780e6-25a2-402e-be8c-8e5e3e8b4b7d.jpg',
  '/objects/uploads/bc6780e6-25a2-402e-be8c-8e5e3e8b4b7d.jpg',
  '/api/storage/objects/uploads/bc6780e6-25a2-402e-be8c-8e5e3e8b4b7d.jpg'
);
