import { User } from "../entities/User";
import { Arg, Field, Mutation, Resolver, Ctx, ObjectType, Query } from "type-graphql";
import { MyContext } from "../types";
import argon2 from 'argon2'
import { EntityManager } from '@mikro-orm/postgresql'
import { COOKIE_NAME, FORGOT_PASSWORD_PREFIX } from "../constants";
import { UsernamePasswordInput } from "./UsernamePasswordInput";
import { validateRegister } from "../utils/validateRegister";
import { sendEmail } from "../utils/sendEmail";
import { v4 } from "uuid"

@ObjectType()
class FieldError {
    @Field()
    field: string

    @Field()
    message: string
}

@ObjectType()
class UserResponse {
    @Field(() => [FieldError], { nullable: true })
    errors?: FieldError[]

    @Field(() => User, { nullable: true })
    user?: User
}

@Resolver()
export class UserResolver {
    @Mutation(() => UserResponse)
    async changePassword(
        @Arg('token') token: string,
        @Arg('newPassword') newPassword: string,
        @Ctx() { em, req, redis }: MyContext
    ): Promise<UserResponse> {
        if (newPassword.length <= 2) {
            return {
                errors: [
                    {
                        field: 'newPassword',
                        message: 'length must be greater than 2',
                    }
                ]
            }
        }
        const userId = await redis.get(FORGOT_PASSWORD_PREFIX + token)
        if (!userId) {
            return {
                errors: [
                    {
                        field: 'token',
                        message: 'token expired'
                    }
                ]
            }
        }

        const user = await em.findOne(User, { id: parseInt(userId) })

        if (!user) {
            return {
                errors: [
                    {
                        field: 'token',
                        message: 'user no longer exists'
                    }
                ]
            }
        }

        user.password = await argon2.hash(newPassword)
        await em.persistAndFlush(user)

        // * login user after password changed
        req.session.userId = user.id

        return { user }
    }

    @Mutation(() => Boolean)
    async forgotPassword(
        @Arg('email') email: string,
        @Ctx() { em, redis }: MyContext
    ) {
        const user = await em.findOne(User, { email })
        if (!user) {
            // * the email is not in the database
            return true
        }

        const token = v4()

        await redis.set(FORGOT_PASSWORD_PREFIX + token, user.id, 'ex', 1000 * 60 * 60 * 24 * 3)

        await sendEmail(email,
            `<a href="http://localhost:3000/change-password/${token}">Reset Password</a>`
        )
        return true
    }

    @Query(() => User, { nullable: true })
    async me(@Ctx() { em, req }: MyContext) {
        // * you are not logged in
        if (!req.session.userId) {
            return null
        }
        const user = await em.findOne(User, { id: req.session.userId })
        return user
    }

    @Mutation(() => UserResponse)
    async register(
        @Arg('options', () => UsernamePasswordInput) options: UsernamePasswordInput,
        @Ctx() { req, em }: MyContext
    ): Promise<UserResponse> {
        const errors = validateRegister(options)
        if (errors) {
            return { errors }
        }

        const hashedPassword = await argon2.hash(options.password)
        let user
        try {
            const result = await (em as EntityManager).createQueryBuilder(User).getKnexQuery().insert({
                username: options.username,
                email: options.email,
                password: hashedPassword,
                created_at: new Date(),
                updated_at: new Date()
            }).returning("*")
            user = result[0]
        } catch (err) {
            // * duplicate username error
            if (err.code === process.env.ERR_CODE) {
                return {
                    errors: [{
                        field: 'username',
                        message: "username already taken"
                    }]
                }
            }
        }

        // * store user id session
        // * this will set a cookie on the user
        // * keep them logged in
        req.session.userId = user.id

        return { user }
    }

    @Mutation(() => UserResponse)
    async login(
        @Arg('usernameOrEmail') usernameOrEmail: string,
        @Arg('password') password: string,
        @Ctx() { em, req }: MyContext
    ): Promise<UserResponse> {
        const user = await em.findOne(User,
            usernameOrEmail.includes('@') ?
                { email: usernameOrEmail }
                : { username: usernameOrEmail }
        )
        if (!user) {
            return {
                errors: [{
                    field: 'usernameOrEmail',
                    message: "that username doesn't exist"
                }]
            }
        }
        const validPassword = await argon2.verify(user.password, password)
        if (!validPassword) {
            return {
                errors: [{
                    field: 'password',
                    message: "incorrect password"
                }]
            }
        }

        req.session.userId = user.id

        return { user }
    }

    @Mutation(() => Boolean)
    logout(@Ctx() { req, res }: MyContext) {
        return new Promise((resolve) =>
            req.session.destroy((err) => {
                res.clearCookie(COOKIE_NAME)
                if (err) {
                    console.log(err)
                    resolve(false)
                    return
                }
                resolve(true)
            }))
    }
}