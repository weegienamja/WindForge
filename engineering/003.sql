BEGIN;
CREATE TABLE IF NOT EXISTS blade_geometry (
    release text, model text, record jsonb NOT NULL,
    PRIMARY KEY (release, model),
    FOREIGN KEY (release, model) REFERENCES turbine
);
GRANT SELECT ON blade_geometry TO windforge;
COMMIT;
