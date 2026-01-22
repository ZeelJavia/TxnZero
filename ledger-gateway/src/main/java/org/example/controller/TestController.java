package org.example.controller;

import org.example.repository.UserRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/test")
public class TestController {

    @Autowired
    private UserRepository userRepository;

    // ✅ This forces a DB Read
    @GetMapping("/replica-check")
    @Transactional(readOnly = true) // <--- This triggers the Replica Routing
    public String checkReplica() {
        long count = userRepository.count(); // SQL: SELECT COUNT(*) FROM users...
        return "Replica Working! Total Users: " + count;
    }
}