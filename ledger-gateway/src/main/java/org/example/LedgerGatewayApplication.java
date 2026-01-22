package org.example;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.autoconfigure.jdbc.DataSourceAutoConfiguration; // ✅ Import this
import org.springframework.boot.autoconfigure.domain.EntityScan;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;

@SpringBootApplication(exclude = {DataSourceAutoConfiguration.class})
@EnableJpaRepositories(basePackages = "org.example.repository")
@EntityScan(basePackages = "org.example.model")
public class LedgerGatewayApplication {

    public static void main(String[] args) {
        SpringApplication.run(LedgerGatewayApplication.class, args);
    }
}