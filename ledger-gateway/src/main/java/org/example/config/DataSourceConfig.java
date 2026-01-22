package org.example.config;

import com.zaxxer.hikari.HikariDataSource;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.jdbc.DataSourceBuilder;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Primary;
import org.springframework.jdbc.datasource.LazyConnectionDataSourceProxy;

import javax.sql.DataSource;
import java.util.HashMap;
import java.util.Map;

@Configuration
public class DataSourceConfig {

    // 1. Configure the Writer (Primary) from properties
    @Bean
    @ConfigurationProperties(prefix = "spring.datasource.writer")
    public DataSource writerDataSource() {
        return DataSourceBuilder.create().type(HikariDataSource.class).build();
    }

    // 2. Configure the Reader (Replica) from properties
    @Bean
    @ConfigurationProperties(prefix = "spring.datasource.reader")
    public DataSource readerDataSource() {
        return DataSourceBuilder.create().type(HikariDataSource.class).build();
    }

    // 3. Set up the Routing Logic
    @Bean
    public DataSource routingDataSource(
            @Qualifier("writerDataSource") DataSource writerDataSource,
            @Qualifier("readerDataSource") DataSource readerDataSource) {

        ReplicationRoutingDataSource routingDataSource = new ReplicationRoutingDataSource();

        Map<Object, Object> dataSourceMap = new HashMap<>();
        dataSourceMap.put("writer", writerDataSource);
        dataSourceMap.put("reader", readerDataSource);

        routingDataSource.setTargetDataSources(dataSourceMap);
        routingDataSource.setDefaultTargetDataSource(writerDataSource); // Safety: Default to Write

        return routingDataSource;
    }

    // 4. Wrap it in a Lazy Proxy (CRITICAL for correct routing)
    @Bean
    @Primary
    public DataSource dataSource(DataSource routingDataSource) {
        return new LazyConnectionDataSourceProxy(routingDataSource);
    }
}