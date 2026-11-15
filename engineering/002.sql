BEGIN;
CREATE TABLE IF NOT EXISTS specification(
 release text, model text, component text, locator text, field text, value jsonb NOT NULL, unit text NOT NULL,
 line integer, embedding vector(384) NOT NULL, PRIMARY KEY(release,model,component,locator,field),
 FOREIGN KEY(release,model,component) REFERENCES component);
GRANT SELECT ON specification TO windforge;
COMMIT;
