package org.example.config;

import org.apache.commons.pool2.impl.GenericObjectPoolConfig;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import redis.clients.jedis.Jedis;
import redis.clients.jedis.JedisPool;

@Configuration
public class RedisConfig {

    @Value("${spring.data.redis.url}")
    private String url;

    @Bean
    public JedisPool jedisPool() {
        GenericObjectPoolConfig<?> poolConfig = new GenericObjectPoolConfig<>();
        poolConfig.setJmxEnabled(false);
        return new JedisPool((GenericObjectPoolConfig<Jedis>) poolConfig, url);
    }
}
