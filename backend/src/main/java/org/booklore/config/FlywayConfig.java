package org.booklore.config;

import org.flywaydb.core.Flyway;
import org.flywaydb.core.api.exception.FlywayValidateException;
import org.springframework.boot.flyway.autoconfigure.FlywayMigrationStrategy;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class FlywayConfig {

    @Bean
    FlywayMigrationStrategy flywayMigrationStrategy() {
        return flyway -> {
            try {
                flyway.migrate();
            } catch (FlywayValidateException e) {
                flyway.repair();
                flyway.migrate();
            }
            folioFlyway(flyway).migrate();
        };
    }

    /**
     * Fork-owned migrations keep their own location and history table, so their versions never
     * collide with upstream's sequence. They run after upstream's migrations because they alter
     * upstream tables.
     */
    private Flyway folioFlyway(Flyway flyway) {
        return Flyway.configure()
                .configuration(flyway.getConfiguration())
                .locations("classpath:db/folio-migration")
                .table("folio_flyway_schema_history")
                .baselineOnMigrate(true)
                .baselineVersion("0")
                .load();
    }
}
