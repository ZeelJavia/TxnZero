package org.example.config;

import org.apache.commons.pool2.impl.GenericObjectPoolConfig;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import redis.clients.jedis.Jedis;
import redis.clients.jedis.JedisPool;
import redis.clients.jedis.JedisPoolConfig;

import java.net.URI;

@Configuration
public class RedisConfig {

    @Value("${REDIS_URL}")
    private String redisUrl;

    @Bean
    public JedisPool jedisPool() {
        URI uri = URI.create(redisUrl);

        JedisPoolConfig config = new JedisPoolConfig();
        config.setMaxTotal(50);
        config.setMaxIdle(10);
        config.setMinIdle(2);
        config.setJmxEnabled(false);

        return new JedisPool(
                config,
                uri.getHost(),
                uri.getPort(),
                5000,
                uri.getUserInfo() == null ? null : uri.getUserInfo().split(":", 2)[1],
                true   // TLS
        );
    }
}
