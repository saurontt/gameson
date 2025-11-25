const bcrypt = require('bcryptjs'); bcrypt.hash('qualquercoisa123', 10, (err, hash) => console.log(hash));
