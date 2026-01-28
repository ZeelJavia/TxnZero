package org.example.config;

import org.apache.commons.pool2.impl.GenericObjectPoolConfig;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import redis.clients.jedis.Jedis;
import redis.clients.jedis.JedisPool;

@Configuration
public class RedisConfig {

    @Bean
    public JedisPool jedisPool() {
        GenericObjectPoolConfig<?> poolConfig = new GenericObjectPoolConfig<>();
        poolConfig.setJmxEnabled(false);
        return new JedisPool((GenericObjectPoolConfig<Jedis>) poolConfig,"localhost", 6379);
    }
}
