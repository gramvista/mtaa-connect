# Features

Domain modules contain administrator authentication, resident validation/mutations, location/account management, pending payments and campaign confirmation. Every server mutation authenticates the caller before using service-only transactional PostgreSQL functions. The database tests execute the version-controlled migrations under simulated Supabase roles.
