-- Run while connected to the keycloak database as postgres.
ALTER SCHEMA public OWNER TO keycloak;
GRANT ALL ON SCHEMA public TO keycloak;
GRANT ALL PRIVILEGES ON DATABASE keycloak TO keycloak;
