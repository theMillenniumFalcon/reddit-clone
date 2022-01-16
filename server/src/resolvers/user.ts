import { User } from "../entities/User";
import { Arg, Field, InputType, Mutation, Resolver, Ctx } from "type-graphql";
import { MyContext } from "../types";
import argon2 from 'argon2'

@InputType()
class UsernamePasswordInput {
    @Field()
    username: string;

    @Field()
    password: string;
}

@Resolver()
export class UserResolver {
    @Mutation(() => User)
    async register(
        @Arg('options', () => UsernamePasswordInput) options: UsernamePasswordInput,
        @Ctx() ctx: MyContext
    ) {
        const hashedPassword = await argon2.hash(options.password)
        const user = ctx.em.create(User, {username: options.username, password: hashedPassword})
        await ctx.em.persistAndFlush(user)
        return user
    }
}