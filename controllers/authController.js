const mongoose = require('mongoose');
const User = mongoose.model('User')

const passport = require('passport');
const crypto = require('crypto');
const promisify = require('es6-promisify');
const mail = require('../handlers/mail');

exports.login = passport.authenticate('local', {
    failureRedirect: '/login',
    failureFlash: 'Failed Login!',
    successRedirect: '/',
    successFlash: 'You are now logged in!'
});

exports.logout = (req, res) => {
    req.logout();
    req.flash('success', 'You are now logged out!');
    res.redirect('/');
};

exports.forgot = async (req, res) => {
    // 1 - See if a user with that email exists
    const user = await User.findOne({ email: req.body.email });
    if (!user) {
        req.flash('success', 'You have been emailed a password reset link.');
        return res.redirect('/login');
    }

    // 2 - Set reset tokens and expiry on their account
    user.resetPasswordToken = crypto.randomBytes(20).toString('hex');
    user.resetPasswordExpires = Date.now() + 3600000; // 1 hour from now
    await user.save();

    // 3 - Send them an email with the token
    const resetURL = `http://${req.headers.host}/account/reset/${user.resetPasswordToken}`;
    await mail.send({
        user,
        subject: 'Password Reset',
        resetURL,
        filename: 'password-reset'
    })

    // 4 - Redirect to login page
    req.flash('success', `You have been emailed a password reset link.`)
    res.redirect('/login');
};

exports.reset = async (req, res) => {
    const user = await User.findOne({
        resetPasswordToken: req.params.token,
        resetPasswordExpires: { $gt: Date.now() }
    });

    if (!user) {
        req.flash('error', 'Password reset is invalid or has expired');
        return res.redirect('/login');
    }

    // If there is a user, show the reset password form
    res.render('reset', { title: 'Reset your Password' });
};

exports.update = async (req, res) => {
    const user = await User.findOne({
        resetPasswordToken: req.params.token,
        resetPasswordExpires: { $gt: Date.now() }
    });

    if (!user) {
        req.flash('error', 'Password reset is invalid or has expired');
        return res.redirect('/login');
    }

    const setPassword = promisify(user.setPassword, user);
    await setPassword(req.body.password);
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    const updatedUser = await user.save();

    await req.login(updatedUser);

    req.flash('Success', 'Nice! Your password has been reset! You are now logged in!');
    res.redirect('/');
};

exports.isLoggedIn = (req, res, next) => {
    // First check if the user is authenticated
    if (req.isAuthenticated()) {
        next();
        return;
    }

    req.flash('error', 'Oops you must be logged in to do that!');
    res.redirect('/login');
};

exports.confirmedPasswords = (req, res, next) => {
    if(req.body.password === req.body['password-confirm']) {
        next();
        return;
    }

    req.flash('error', 'Passwords do not match!');
    res.redirect('back');
};